export function wait(ms: number) {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve("");
    }, ms);
  });
}

export function getRandomNumber() {
  // Mock a response from Chainlink oracles with a Javascript pseudo-random
  // number (Math.random() is not that random)
  // In Solidity, this number could be anything from 0 to 2^256
  // but we're not going to play with these numbers in Javascript though
  return Math.floor(Math.random() * Math.pow(10, 9));
}
