// This is straight from parse_unit_factor in config.c of canonical git
const num = (val: string | number): number => {
  if (typeof val === 'number') {
    return val
  }

  const valLower = val.toLowerCase()
  let n = parseInt(valLower, 10)
  if (valLower.endsWith('k')) n *= 1024
  if (valLower.endsWith('m')) n *= 1024 * 1024
  if (valLower.endsWith('g')) n *= 1024 * 1024 * 1024
  return n
}

// This is straight from git_parse_maybe_bool_text in config.c of canonical git
const bool = (val: string | boolean): boolean => {
  if (typeof val === 'boolean') {
    return val
  }

  const valTrimmed = val.trim().toLowerCase()
  if (valTrimmed === 'true' || valTrimmed === 'yes' || valTrimmed === 'on')
    return true
  if (valTrimmed === 'false' || valTrimmed === 'no' || valTrimmed === 'off')
    return false
  throw Error(
    `Expected 'true', 'false', 'yes', 'no', 'on', or 'off', but got ${val}`
  )
}

type Schema = {
  [section: string]: {
    [name: string]: (val: string | number | boolean) => unknown
  }
}

const schema: Schema = {
  core: {
    filemode: bool,
    bare: bool,
    logallrefupdates: bool,
    symlinks: bool,
    ignorecase: bool,
    bigFileThreshold: num,
  },
}

// https://git-scm.com/docs/git-config#_syntax

// section starts with [ and ends with ]
// section is alphanumeric (ASCII) with - and .
// section is case insensitive
// subsection is optional
// subsection is specified after section and one or more spaces
// subsection is specified between double quotes
const SECTION_LINE_REGEX = /^\[([A-Za-z0-9-.]+)(?: "(.*)")?\]$/
const SECTION_REGEX = /^[A-Za-z0-9-.]+$/

// variable lines contain a name, and equal sign and then a value
// variable lines can also only contain a name (the implicit value is a boolean true)
// variable name is alphanumeric (ASCII) with -
// variable name starts with an alphabetic character
// variable name is case insensitive
const VARIABLE_LINE_REGEX = /^([A-Za-z][A-Za-z-]*)(?: *= *(.*))?$/
const VARIABLE_NAME_REGEX = /^[A-Za-z][A-Za-z-]*$/

// Comments start with either # or ; and extend to the end of line
const VARIABLE_VALUE_COMMENT_REGEX = /^(.*?)( *[#;].*)$/

type ParsedConfigEntry = {
  line: string
  isSection: boolean
  section: string | null
  subsection: string | null | undefined
  name: string | null
  value: string | null
  path: string
  modified?: boolean
}

const extractSectionLine = (
  line: string
): [string, string | undefined] | null => {
  const matches = SECTION_LINE_REGEX.exec(line)
  if (matches != null) {
    const [, section, subsection] = matches
    return [section, subsection]
  }
  return null
}

const extractVariableLine = (
  line: string
): [string, string] | null => {
  const matches = VARIABLE_LINE_REGEX.exec(line)
  if (matches != null) {
    const [, name, rawValue = 'true'] = matches
    const valueWithoutComments = removeComments(rawValue)
    const valueWithoutQuotes = removeQuotes(valueWithoutComments)
    return [name, valueWithoutQuotes]
  }
  return null
}

const removeComments = (rawValue: string): string => {
  const commentMatches = VARIABLE_VALUE_COMMENT_REGEX.exec(rawValue)
  if (commentMatches == null) {
    return rawValue
  }
  const [, valueWithoutComment, comment] = commentMatches
  // if odd number of quotes before and after comment => comment is escaped
  if (
    hasOddNumberOfQuotes(valueWithoutComment) &&
    hasOddNumberOfQuotes(comment)
  ) {
    return `${valueWithoutComment}${comment}`
  }
  return valueWithoutComment
}

const hasOddNumberOfQuotes = (text: string): boolean => {
  const numberOfQuotes = (text.match(/(?:^|[^\\])"/g) || []).length
  return numberOfQuotes % 2 !== 0
}

const removeQuotes = (text: string): string => {
  return text.split('').reduce((newText, c, idx, textArray) => {
    const isQuote = c === '"' && textArray[idx - 1] !== '\\'
    const isEscapeForQuote = c === '\\' && textArray[idx + 1] === '"'
    if (isQuote || isEscapeForQuote) {
      return newText
    }
    return newText + c
  }, '')
}

const lower = (text: string | null | undefined): string | null => {
  return text != null ? text.toLowerCase() : null
}

const getPath = (
  section: string | null,
  subsection: string | null | undefined,
  name: string | null
): string => {
  return [lower(section), subsection, lower(name)]
    .filter(a => a != null)
    .join('.')
}

type NormalizedPath = {
  section: string | null
  subsection: string | null | undefined
  name: string | null
  path: string
  sectionPath: string
  isSection: boolean
}

const normalizePath = (path: string): NormalizedPath => {
  const pathSegments = path.split('.')
  const section = pathSegments.shift() || null
  const name = pathSegments.pop() || null
  const subsection = pathSegments.length ? pathSegments.join('.') : undefined

  return {
    section,
    subsection,
    name,
    path: getPath(section, subsection, name),
    sectionPath: getPath(section, subsection, null),
    isSection: !!section,
  }
}

const findLastIndex = <T>(
  array: T[],
  callback: (item: T) => boolean
): number => {
  return array.reduce((lastIndex, item, index) => {
    return callback(item) ? index : lastIndex
  }, -1)
}

// Note: there are a LOT of edge cases that aren't covered (e.g. keys in sections that also
// have subsections, [include] directives, etc.
export class GitConfig {
  parsedConfig: ParsedConfigEntry[]

  constructor(text?: string | null) {
    let section: string | null = null
    let subsection: string | null | undefined = null
    this.parsedConfig = text
      ? text.split('\n').map(line => {
          let name: string | null = null
          let value: string | null = null

          const trimmedLine = line.trim()
          const extractedSection = extractSectionLine(trimmedLine)
          const isSection = extractedSection != null
          if (isSection) {
            ;[section, subsection] = extractedSection
          } else {
            const extractedVariable = extractVariableLine(trimmedLine)
            const isVariable = extractedVariable != null
            if (isVariable) {
              ;[name, value] = extractedVariable
            }
          }

          const path = getPath(section, subsection, name)
          return { line, isSection, section, subsection, name, value, path }
        })
      : []
  }

  static from(text?: string | null): GitConfig {
    return new GitConfig(text)
  }

  async get(path: string, getall = false): Promise<unknown | unknown[]> {
    const normalizedPath = normalizePath(path).path
    const allValues = this.parsedConfig
      .filter(config => config.path === normalizedPath)
      .map(({ section, name, value }) => {
        const fn =
          section && name && schema[section] && schema[section][name]
        return fn && value ? fn(value) : value
      })
    return getall ? allValues : allValues.pop()
  }

  async getall(path: string): Promise<unknown[]> {
    return this.get(path, true) as Promise<unknown[]>
  }

  async getSubsections(section: string): Promise<Array<string | null | undefined>> {
    return this.parsedConfig
      .filter(config => config.isSection && config.section === section)
      .map(config => config.subsection)
  }

  async deleteSection(section: string, subsection?: string | null): Promise<void> {
    this.parsedConfig = this.parsedConfig.filter(
      config =>
        !(config.section === section && config.subsection === subsection)
    )
  }

  async append(path: string, value: unknown): Promise<void> {
    return this.set(path, value, true)
  }

  async set(path: string, value: unknown, append = false): Promise<void> {
    const {
      section,
      subsection,
      name,
      path: normalizedPath,
      sectionPath,
      isSection,
    } = normalizePath(path)

    const configIndex = findLastIndex(
      this.parsedConfig,
      config => config.path === normalizedPath
    )
    if (value == null) {
      if (configIndex !== -1) {
        this.parsedConfig.splice(configIndex, 1)
      }
    } else {
      if (configIndex !== -1) {
        const config = this.parsedConfig[configIndex]
        // Name should be overwritten in case the casing changed
        const modifiedConfig: ParsedConfigEntry = Object.assign({}, config, {
          name,
          value: String(value),
          modified: true,
        })
        if (append) {
          this.parsedConfig.splice(configIndex + 1, 0, modifiedConfig)
        } else {
          this.parsedConfig[configIndex] = modifiedConfig
        }
      } else {
        const sectionIndex = this.parsedConfig.findIndex(
          config => config.path === sectionPath
        )
        const newConfig: ParsedConfigEntry = {
          line: '',
          section,
          subsection,
          name,
          value: String(value),
          modified: true,
          path: normalizedPath,
          isSection: false,
        }
        if (section && SECTION_REGEX.test(section) && name && VARIABLE_NAME_REGEX.test(name)) {
          if (sectionIndex >= 0) {
            // Reuse existing section
            this.parsedConfig.splice(sectionIndex + 1, 0, newConfig)
          } else {
            // Add a new section
            const newSection: ParsedConfigEntry = {
              line: '',
              isSection,
              section,
              subsection,
              modified: true,
              path: sectionPath,
              name: null,
              value: null,
            }
            this.parsedConfig.push(newSection, newConfig)
          }
        }
      }
    }
  }

  toString(): string {
    return this.parsedConfig
      .map(({ line, section, subsection, name, value, modified = false }) => {
        if (!modified) {
          return line
        }
        if (name != null && value != null) {
          if (typeof value === 'string' && /[#;]/.test(value)) {
            // A `#` or `;` symbol denotes a comment, so we have to wrap it in double quotes
            return `\t${name} = "${value}"`
          }
          return `\t${name} = ${value}`
        }
        if (subsection != null) {
          return `[${section} "${subsection}"]`
        }
        return `[${section}]`
      })
      .join('\n')
  }
}

