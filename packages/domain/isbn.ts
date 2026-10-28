export function isIsbn13(value: string) {
  if (!/^97[89]\d{10}$/.test(value)) return false;
  return [...value].reduce((sum, digit, i) => sum + Number(digit) * (i % 2 ? 3 : 1), 0) % 10 === 0;
}
