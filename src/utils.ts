import { BigInt } from "@graphprotocol/graph-ts";

export const minute = BigInt.fromI32(60);
export const hour = BigInt.fromI32(3600);
export const day = BigInt.fromI32(86400);

export const zero = BigInt.fromI32(0);
export const one = BigInt.fromI32(1);

export const zeroAddress = "0x0000000000000000000000000000000000000000";

export function getOpenTime(timestamp: BigInt, interval: BigInt): BigInt {
  const excess = timestamp.mod(interval);
  return timestamp.minus(excess);
}

export function getDayOpenTime(timestamp: BigInt): BigInt {
  const interval = day;
  return getOpenTime(timestamp, interval);
}

export function getDayCloseTime(timestamp: BigInt): BigInt {
  return getDayOpenTime(timestamp)
    .plus(day)
    .minus(one);
}
