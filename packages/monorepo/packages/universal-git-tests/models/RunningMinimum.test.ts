import { test } from 'node:test'
import assert from 'node:assert'
import { RunningMinimum } from '@awesome-os/universal-git-src/models/RunningMinimum.ts'

test('RunningMinimum', async (t) => {
  await t.test('initial value is null', () => {
    const rm = new RunningMinimum<number>()
    assert.strictEqual(rm.value, null)
  })

  await t.test('consider first value sets it', () => {
    const rm = new RunningMinimum<number>()
    rm.consider(5)
    assert.strictEqual(rm.value, 5)
  })

  await t.test('consider smaller value updates minimum', () => {
    const rm = new RunningMinimum<number>()
    rm.consider(10)
    rm.consider(5)
    assert.strictEqual(rm.value, 5)
  })

  await t.test('consider larger value does not update minimum', () => {
    const rm = new RunningMinimum<number>()
    rm.consider(5)
    rm.consider(10)
    assert.strictEqual(rm.value, 5)
  })

  await t.test('consider null is ignored', () => {
    const rm = new RunningMinimum<number>()
    rm.consider(5)
    rm.consider(null)
    assert.strictEqual(rm.value, 5)
  })

  await t.test('consider undefined is ignored', () => {
    const rm = new RunningMinimum<number>()
    rm.consider(5)
    rm.consider(undefined)
    assert.strictEqual(rm.value, 5)
  })

  await t.test('consider null when value is null does nothing', () => {
    const rm = new RunningMinimum<number>()
    rm.consider(null)
    assert.strictEqual(rm.value, null)
  })

  await t.test('reset clears value', () => {
    const rm = new RunningMinimum<number>()
    rm.consider(5)
    rm.reset()
    assert.strictEqual(rm.value, null)
  })

  await t.test('works with strings', () => {
    const rm = new RunningMinimum<string>()
    rm.consider('zebra')
    rm.consider('apple')
    rm.consider('banana')
    assert.strictEqual(rm.value, 'apple')
  })

  await t.test('works with multiple values', () => {
    const rm = new RunningMinimum<number>()
    rm.consider(10)
    rm.consider(3)
    rm.consider(7)
    rm.consider(1)
    rm.consider(5)
    assert.strictEqual(rm.value, 1)
  })

  await t.test('works with negative numbers', () => {
    const rm = new RunningMinimum<number>()
    rm.consider(5)
    rm.consider(-3)
    rm.consider(0)
    assert.strictEqual(rm.value, -3)
  })

  await t.test('reset and consider again', () => {
    const rm = new RunningMinimum<number>()
    rm.consider(5)
    rm.reset()
    rm.consider(10)
    assert.strictEqual(rm.value, 10)
  })
})

