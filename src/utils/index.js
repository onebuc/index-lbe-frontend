
export const max_uint = "115792089237316195423570985008687907853269984665640564039457584007913129639935";

export function applyDecimals (value, decimals) {
  return toBigNumber(value).isZero() ? 0 : new window.BigNumber(value).div(new window.BigNumber(10).pow(new window.BigNumber(decimals))).toString();
}
export function removeDecimals (value, decimals) {
  return new window.BigNumber(value).times(new window.BigNumber(10).pow(new window.BigNumber(decimals))).toString();
}
export function toBigNumber (value) {
  return new window.BigNumber(value);
}
