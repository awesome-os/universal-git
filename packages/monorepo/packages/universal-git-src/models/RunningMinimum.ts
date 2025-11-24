// This is convenient for computing unions/joins of sorted lists.
export class RunningMinimum<T = number> {
  value: T | null = null

  constructor() {
    // Using a getter for 'value' would just bloat the code.
    // You know better than to set it directly right?
    this.value = null
  }

  consider(value: T | null | undefined): void {
    if (value === null || value === undefined) return
    if (this.value === null) {
      this.value = value
    } else if (value < (this.value as any)) {
      this.value = value
    }
  }

  reset(): void {
    this.value = null
  }
}

