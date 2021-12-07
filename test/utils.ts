import { BigNumber } from "@ethersproject/bignumber";
import { expect } from "chai";
import {
  LinkToken,
  PianoKingRNConsumer,
  VRFCoordinatorMock,
} from "../typechain";
import { getRandomNumber } from "../utils";

export async function requestRandomNumber(
  pianoKingRNConsumer: PianoKingRNConsumer,
  vrfCoordinator: VRFCoordinatorMock,
  linkToken: LinkToken,
  initialLinkBalance: BigNumber,
  linkFee: BigNumber
) {
  const randomnessTx = await pianoKingRNConsumer.requestRandomNumber();
  await randomnessTx.wait(1);

  // We get the request id of the randomness request from the events
  const requestRandomnessFilter =
    pianoKingRNConsumer.filters.RequestedRandomness();
  const [requestRandomnessEvent] = await pianoKingRNConsumer.queryFilter(
    requestRandomnessFilter
  );
  const requestId = requestRandomnessEvent.args.requestId;
  // Mock a response from Chainlink oracles with the number 42 as so-called
  // random number
  const vrfTx = await vrfCoordinator.callBackWithRandomness(
    requestId,
    getRandomNumber(),
    pianoKingRNConsumer.address
  );
  await vrfTx.wait(1);
  // The contract should have lost 2 LINK consumed by Chainlink VRF as fee
  expect(await linkToken.balanceOf(pianoKingRNConsumer.address)).to.be.equal(
    initialLinkBalance.sub(linkFee)
  );
  return initialLinkBalance.sub(linkFee);
}
