import { BigInt, log, Address } from "@graphprotocol/graph-ts";
import { Transfer } from "../generated/NFTChampions/NFTChampions";
import {
  Transaction,
  WalletTransaction,
  Wallet,
  HoldersCounter,
  DailyWalletState,
  DailyHoldersState,
} from "../generated/schema";
import { zero, zeroAddress, getDayOpenTime, getDayCloseTime } from "./utils";

const PLUS = "PLUS";
const MINUS = "MINUS";
const HOLDERS_COUNTER = "HOLDERS_COUNTER";

function getTransferOperationType(address: Address, event: Transfer): string {
  log.info(
    "operation check fired with address: {} event.params.from: {} event.params.to {}",
    [address.toHex(), event.params.from.toHex(), event.params.to.toHex()]
  );
  if (event.params.from.toHex() == address.toHex()) {
    return MINUS;
  }
  if (event.params.to.toHex() == address.toHex()) {
    return PLUS;
  }

  return "UNKNOWN";
}

function updateDailyWalletState(event: Transfer, wallet: Wallet): void {
  const toAddress = event.params.to;
  const fromAddress = event.params.from;

  let openTime = getDayOpenTime(event.block.timestamp);
  let endTime = getDayCloseTime(event.block.timestamp);

  const id = wallet.address + "-" + openTime.toString();
  let dailyWalletState = DailyWalletState.load(id);

  log.info(
    "updating daily wallet state: id {} toWallet {} fromAddress {} wallet.address {} transaction value {} to address match {} from address match {}",
    [
      id,
      toAddress ? toAddress.toHex() : "",
      fromAddress ? fromAddress.toHex() : "",
      wallet.address,
      event.params.value.toHex(),
      toAddress && toAddress.toHex() == wallet.address ? "true" : "false",
      fromAddress && fromAddress.toHex() == wallet.address ? "true" : "false",
    ]
  );

  if (dailyWalletState === null) {
    dailyWalletState = new DailyWalletState(id);
    dailyWalletState.start = openTime;
    dailyWalletState.end = endTime;
    dailyWalletState.wallet = wallet.id;
    dailyWalletState.inflow =
      toAddress.toHex() == wallet.address ? event.params.value : zero;
    dailyWalletState.outflow =
      fromAddress.toHex() == wallet.address ? event.params.value : zero;
    dailyWalletState.volume = event.params.value;
  } else {
    dailyWalletState.inflow =
      toAddress.toHex() == wallet.address
        ? dailyWalletState.inflow.plus(event.params.value)
        : dailyWalletState.inflow;
    dailyWalletState.outflow =
      fromAddress.toHex() == wallet.address
        ? dailyWalletState.outflow.plus(event.params.value)
        : dailyWalletState.outflow;
    dailyWalletState.volume = dailyWalletState.volume.plus(event.params.value);
  }
  dailyWalletState.save();
}

function updateHodlersCounter(
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

function createOrUpdateWallet(address: Address, event: Transfer): Wallet {
  const hexAddress = address.toHex();
  const operation = getTransferOperationType(address, event);
  log.info("detected operation {}", [operation]);
  let wallet = Wallet.load(hexAddress);
  let initialValue = zero;

  // create or update wallet
  if (wallet === null) {
    log.info("creating wallet {}", [hexAddress]);
    wallet = new Wallet(hexAddress);
    log.info("operation {}", [operation.toString()]);
    wallet.address = address.toHex();

    if (hexAddress == zeroAddress && hexAddress == event.params.from.toHex()) {
      wallet.value = zero;
    } else {
      wallet.value = event.params.value;
    }
  } else {
    log.info("updating wallet {}", [hexAddress]);
    initialValue = wallet.value;
    log.info("initial wallet value {}", [initialValue.toString()]);
    if (hexAddress == zeroAddress && hexAddress == event.params.from.toHex()) {
      wallet.value = zero;
    } else {
      wallet.value =
        operation === PLUS
          ? wallet.value.plus(event.params.value)
          : wallet.value.minus(event.params.value);
    }
  }

  wallet.save();

  // update holders counters
  updateDailyWalletState(event, wallet);
  updateDailyHodlersState(event, operation, initialValue, wallet.value);
  updateHodlersCounter(operation, initialValue, wallet.value);

  return wallet;
}

function createWalletTransaction(
  event: Transfer,
  wallet: Wallet,
  transaction: Transaction,
  idSuffix: string
): WalletTransaction {
  let walletTransaction = new WalletTransaction(
    wallet.id + "-" + event.transaction.hash.toHex() + "-" + idSuffix
  );
  walletTransaction.wallet = wallet.id;
  walletTransaction.transaction = transaction.id;
  walletTransaction.value = transaction.value;
  walletTransaction.timestamp = transaction.timestamp;
  walletTransaction.save();
  return walletTransaction;
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
  const walletTo = createOrUpdateWallet(event.params.to, event);
  const walletFrom = createOrUpdateWallet(event.params.from, event);

  createWalletTransaction(event, walletTo, transaction, "to");
  createWalletTransaction(event, walletFrom, transaction, "from");
}
