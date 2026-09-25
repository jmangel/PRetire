// Guards the time zone pin in setupTests.ts: if it's removed, date tests stop
// catching local-time bugs, and this test fails to say so.
test('tests run in a time zone west of UTC', () => {
  expect(new Date('2030-01-01').getFullYear()).toBe(2029);
});

export {};
