import { BigInt } from "@graphprotocol/graph-ts";

export let minute = BigInt.fromI32(60);
export let hour = BigInt.fromI32(3600);
export let day = BigInt.fromI32(86400);

export let zero = BigInt.fromI32(0);
export let one = BigInt.fromI32(1);

export function getOpenTime(timestamp: BigInt, interval: BigInt): BigInt {
  let excess = timestamp.mod(interval);
  return timestamp.minus(excess);
}

export function getDayOpenTime(timestamp: BigInt): BigInt {
  let interval = day;
  return getOpenTime(timestamp, interval);
}

export function getDayCloseTime(timestamp: BigInt): BigInt {
  return getDayOpenTime(timestamp)
    .plus(day)
    .minus(one);
}
