let debug = false;

const setDebug = (_debug: boolean) => {
  debug = _debug;
};
const getDebug = () => debug;

const print = (color: string, s: string) => {
  if (debug) {
    console.log(`\x1b[${color}m${s}\x1b[0m`);
  }
};

const RED = (s: string) => print("31", s);
const GREEN = (s: string) => print("32", s);
const YELLOW = (s: string) => print("33", s);
const CYAN = (s: string) => print("36", s);
const GREY = (s: string) => print("90", s);
const BR_BLUE = (s: string) => print("94", s);
const info = (s: any) => (debug ? console.log(s) : void 0);

export const log = { GREEN, YELLOW, CYAN, BR_BLUE, RED, GREY, setDebug, getDebug, info };
