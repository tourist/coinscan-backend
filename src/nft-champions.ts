import { BigInt, log, Address } from "@graphprotocol/graph-ts";
import { NFTChampions, Transfer } from "../generated/NFTChampions/NFTChampions";
import {
  Transaction,
  Wallet,
  HoldersCounter,
  DailyHoldersState,
} from "../generated/schema";
import { zero, getDayOpenTime, getDayCloseTime } from "./utils";

const PLUS = "PLUS";
const MINUS = "MINUS";
const UNKNOWN = "UNKNOWN";
const HOLDERS_COUNTER = "HOLDERS_COUNTER";

export function getTransferOperationType(
  address: Address,
  event: Transfer
): string {
  log.info(
    "operation check fired with address: {} event.params.from: {} event.params.to {}",
    [
      address.toHex(),
      event.params.from.toHexString(),
      event.params.to.toHexString(),
    ]
  );
  if (event.params.from.toHexString() == address.toHexString()) {
    return MINUS;
  }
  if (event.params.to.toHexString() == address.toHexString()) {
    return PLUS;
  }

  return "UNKNOWN";
}

export function updateHodlersCounter(
  operation: string,
  initialValue: BigInt,
  endValue: BigInt
): void {
  let holdersCounter = HoldersCounter.load(HOLDERS_COUNTER);

  if (holdersCounter === null) {
    holdersCounter = new HoldersCounter(HOLDERS_COUNTER);
    holdersCounter.count = 0;
  }

  log.info("operation {} initial {} endvalue {}", [
    operation.toString(),
    initialValue.toString(),
    endValue.toString(),
  ]);

  if (operation === PLUS && initialValue == zero && endValue > zero) {
    log.info("increase holders counters", []);
    holdersCounter.count = holdersCounter.count + 1;
  }

  if (operation === MINUS && initialValue > zero && endValue == zero) {
    log.info("decrease holders counters", []);
    holdersCounter.count = holdersCounter.count - 1;
  }
  holdersCounter.save();
}

function updateDailyHodlersState(
  event: Transfer,
  operation: string,
  initialValue: BigInt,
  endValue: BigInt
): void {
  let openTime = getDayOpenTime(event.block.timestamp);
  let endTime = getDayCloseTime(event.block.timestamp);
  let dailyHolderState = DailyHoldersState.load(openTime.toString());

  if (dailyHolderState === null) {
    dailyHolderState = new DailyHoldersState(openTime.toString());
    let holdersCounter = HoldersCounter.load(HOLDERS_COUNTER);
    dailyHolderState.count = holdersCounter ? holdersCounter.count : 0;
    dailyHolderState.start = openTime;
    dailyHolderState.end = endTime;
  }

  if (operation === PLUS && initialValue == zero && endValue > zero) {
    log.info("increase holders counters", []);
    dailyHolderState.count = dailyHolderState.count + 1;
  }

  if (operation === MINUS && initialValue > zero && endValue == zero) {
    log.info("decrease holders counters", []);
    dailyHolderState.count = dailyHolderState.count - 1;
  }
  dailyHolderState.save();
}

export function updateWallet(address: Address, event: Transfer): void {
  let operation = getTransferOperationType(address, event);
  log.info("detected operation {}", [operation]);
  // let contract = NFTChampions.bind(event.address);
  let wallet = Wallet.load(address.toHex());
  let initialValue = zero;

  // create or update wallet
  if (wallet === null) {
    log.info("creating wallet {}", [address.toHex()]);
    wallet = new Wallet(address.toHex());
    log.info("operation {}", [operation.toString()]);
    wallet.address = address.toHex();
    wallet.value = event.params.value;
    // wallet.whitelist = contract.whiteList(event.params.to);
  } else {
    log.info("updating wallet {}", [address.toHex()]);
    initialValue = wallet.value;
    log.info("initial wallet value {}", [initialValue.toString()]);
    wallet.value =
      operation === PLUS
        ? wallet.value.plus(event.params.value)
        : wallet.value.minus(event.params.value);
  }

  wallet.save();

  // update holders counters
  updateDailyHodlersState(event, operation, initialValue, wallet.value);
  updateHodlersCounter(operation, initialValue, wallet.value);
}

export function handleTransfer(event: Transfer): void {
  log.info("handleTransfer value: {} from: {} to: {} ", [
    event.params.value.toString(),
    event.params.from.toHex(),
    event.params.to.toHex(),
  ]);
  // Save Transaction entity
  let transaction = new Transaction(
    event.transaction.hash.toHex() + "-" + event.logIndex.toString()
  );
  transaction.from = event.params.from.toHex();
  transaction.to = event.params.to.toHex();
  transaction.txn = event.transaction.hash.toHex();
  transaction.timestamp = event.block.timestamp;
  transaction.value = event.params.value;
  transaction.save();

  // update wallets taking part in transfer
  updateWallet(event.params.to, event);
  updateWallet(event.params.from, event);
}
