const GREEN = (s: string) => {
  console.log(`\x1b[32m${s}\x1b[0m`);
};
const YELLOW = (s: string) => {
  console.log(`\x1b[33m${s}\x1b[0m`);
};
const RED = (s: string) => {
  console.log(`\x1b[31m${s}\x1b[0m`);
};
const CYAN = (s: string) => {
  console.log(`\x1b[36m${s}\x1b[0m`);
};
const BR_BLUE = (s: string) => {
  console.log(`\x1b[94m${s}\x1b[0m`);
};
export const log = { GREEN, YELLOW, CYAN, BR_BLUE, RED };
