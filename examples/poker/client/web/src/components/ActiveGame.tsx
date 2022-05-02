import { useHathoraContext } from "../context/GameContext";
import "playing-card";

import styled, { css } from "styled-components";
import { useState } from "react";
import ActivePot from "./ActivePot";
import { useWindowSize } from "rooks";

const PlayerBoard = styled.div`
  height: 100vh;
  width: 100%;
  display: flex;
  align-items: center;
  flex-direction: column;

  playing-card {
    --card-size: 4rem;
    margin: 0.5rem;

    @media (max-width: 486px) {
      --card-size: 3rem;
    }
  }
`;

const PokerTable = styled.div`
  width: 80%;
  position: relative;
  height: 400px;
  @media (min-width: 1201px) {
    width: 850px;
    height: 450px;
  }
  display: flex;
  padding: 2%;
  align-items: center;
  justify-content: center;
  flex-direction: row;
  margin-bottom: 5rem;
  border-radius: 60%;
  background-color: #154b0a;
  border: 0.75rem solid #6b342b;

  @media (max-width: 486px) {
    width: 90%;
    height: 200px;
    border-radius: 5vw;
    margin-bottom: 2rem;
  }

  playing-card {
    --card-size: 2rem;
    margin: 0.5rem;

    @media (max-width: 486px) {
      --card-size: 1.2rem;
    }
  }
`;

const CalculatePlayerPosition = (index: number, size: number) => {
  if (size === 2) {
    return css`
      top: -20%;
      right: 45%;
    `;
  }
};

const OpponentWrapper = styled.div<{ index: number; size: number }>`
  position: absolute;
  background-color: white;
  ${({ index, size }) => CalculatePlayerPosition(index, size)}
`;

const rankConversion: Record<string, string> = {
  Two: "2",
  Three: "3",
  Four: "4",
  Five: "5",
  Six: "6",
  Seven: "7",
  Eight: "8",
  Nine: "9",
  Ten: "10",
  Jack: "J",
  Queen: "Q",
  King: "K",
  Ace: "A",
};

const BuildCircle = (num: number) => {
  const type = 1;
  let radius = "100"; //distance from center
  let start = -90; //shift start from 0
  let slice = (360 * type) / num;

  let items = [];
  let i;
  for (i = 0; i < num; i++) {
    let rotate = slice * i + start;
    let rotateReverse = rotate * -1;

    items.push({
      radius: radius,
      rotate: rotate,
      rotateReverse: rotateReverse,
    });
  }

  return items;
};

export default function ActiveGame() {
  const { playerState, user, raise, fold, call, getUserName } = useHathoraContext();
  const [raiseAmount, setRaiseAmount] = useState(100);

  const { outerWidth } = useWindowSize();
  const isMobile = (outerWidth || 0) <= 486;

  const currentUserIndex = playerState?.players.findIndex((p) => p.id === user?.id) ?? 0;
  const currentUser = currentUserIndex !== undefined ? playerState?.players[currentUserIndex] : undefined;

  const players = [
    ...(playerState?.players.slice(currentUserIndex || 0, playerState.players.length) || []),
    ...(playerState?.players.slice(0, currentUserIndex) || []),
  ].filter((p) => p.id !== user?.id);

  console.log(players, playerState?.players, currentUserIndex, user);
  const handleRaise = () => {
    raise(raiseAmount);
  };

  // @ts-ignore
  return (
    <div className="bg-slate-100 flex flex-col py-5 items-center justify-center">
      {!isMobile && <ActivePot />}
      <PlayerBoard>
        <div className="w-full flex item-center justify-center">
          <PokerTable>
            {playerState?.revealedCards.map((card, index) => (
              <playing-card key={index} rank={rankConversion[card.rank]} suit={card.suit[0]}></playing-card>
            ))}
            {!isMobile &&
              players.map((player, index) => (
                <OpponentWrapper
                  key={player.id}
                  className="rounded border shadow p-3 text-xs"
                  index={index}
                  size={players.length}
                >
                  <div>{getUserName(player?.id)}</div>
                  <div>In Pot: {player.chipsInPot}</div>
                  <div>Chips: {player.chipCount}</div>
                </OpponentWrapper>
              ))}
          </PokerTable>
        </div>
        {isMobile && (
          <div className="flex w-full px-2 flex-col">
            {players.map((player) => (
              <div
                className={`w-full bg-white p-3 rounded border shadow drop-shadow mb-5 ${
                  player.id === playerState?.activePlayer ? "border-blue-800 shadow-blue-800" : ""
                }`}
              >
                <div className="flex">
                  <div className="font-bold">{getUserName(player.id)}</div>
                  {player.id === playerState?.activePlayer ? "(Current Player)" : ""}
                </div>
                <div className="flex flex-col">
                  <div>
                    <span className="font-bold">In pot:</span> ${player.chipsInPot}{" "}
                  </div>
                  <div>
                    <span className="font-bold">Chips:</span> ${player.chipCount}{" "}
                  </div>
                </div>
                <div className="flex">
                  {player?.cards?.map((card, index) => (
                    <playing-card
                      // @ts-ignore need to type the global declaration
                      style={{ "--card-size": "2rem" }}
                      key={index}
                      rank={rankConversion[card.rank]}
                      suit={card.suit[0]}
                    ></playing-card>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
        {isMobile && <ActivePot />}
        <div className="flex">
          {currentUser?.cards.map((card) => (
            <playing-card rank={rankConversion[card.rank]} suit={card.suit[0]}></playing-card>
          ))}
        </div>
        <div className="flex md:flex-row flex-col w-full mt-3 px-5">
          <input
            value={raiseAmount}
            onChange={(e) => setRaiseAmount(parseInt(e.target.value))}
            type="number"
            placeholder="Raise"
            className="w-full flex-1 px-5 shadow py-3 placeholder-gray-500 focus:ring-indigo-500 focus:border-indigo-500 focus:border-r-0 border-gray-300 rounded-l md:rounder-r-0 md:mb-0 mb-5"
          />
          <button
            onClick={handleRaise}
            className="block md:w-1/3 bg-green-600 border border-green-600 rounded lg:rounded-r lg:rounded-l-0 p-2 text-xl font-semibold text-white text-center hover:bg-green-900 shadow"
          >
            Raise
          </button>
        </div>
        <div className="flex w-full flex-col md:flex-row px-5 items-center mb-5">
          <button
            onClick={call}
            className="mt-3 md:mr-1 w-full block bg-blue-800 border border-blue-800 rounded p-2 text-xl font-semibold text-white text-center hover:bg-blue-900 h-fit"
          >
            Call
          </button>
          <button
            onClick={fold}
            className="mt-3 md:ml-1 w-full block bg-red-800 border border-red-800 rounded p-2 text-xl font-semibold text-white text-center hover:bg-red-900 h-fit"
          >
            Fold
          </button>
        </div>
      </PlayerBoard>
    </div>
  );
}
