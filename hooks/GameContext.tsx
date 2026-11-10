import { PropsWithChildren, createContext, useContext, useMemo, useRef, useState } from 'react';
import { Card, Player } from '@/types/poker';

interface GameContextValue {
  community: Card[];
  players: Player[];
  setCommunity: (cards: Card[]) => void;
  addPlayer: () => void;
  updatePlayer: (id: string, patch: Partial<Omit<Player, 'id'>>) => void;
  removePlayer: (id: string) => void;
  /** Replaces the whole game, e.g. after scanning a photo of the table. */
  loadGame: (community: Card[], hands: Card[][]) => void;
  reset: () => void;
}

const GameContext = createContext<GameContextValue | null>(null);

export function GameProvider({ children }: PropsWithChildren) {
  const [community, setCommunity] = useState<Card[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const counter = useRef(0);
  const createPlayer = (): Player => {
    counter.current += 1;
    return { id: `player-${counter.current}`, name: `Player ${counter.current}`, cards: [] };
  };

  const value = useMemo<GameContextValue>(() => ({
    community,
    players,
    setCommunity,
    addPlayer: () => setPlayers((current) => [...current, createPlayer()]),
    updatePlayer: (id, patch) =>
      setPlayers((current) => current.map((player) => player.id === id ? { ...player, ...patch } : player)),
    removePlayer: (id) => setPlayers((current) => current.filter((player) => player.id !== id)),
    loadGame: (nextCommunity, hands) => {
      counter.current = hands.length;
      setCommunity(nextCommunity);
      setPlayers(hands.map((cards, index) => ({ id: `player-${index + 1}`, name: `Player ${index + 1}`, cards })));
    },
    reset: () => {
      counter.current = 0;
      setCommunity([]);
      setPlayers([]);
    },
  }), [community, players]);

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGame() {
  const context = useContext(GameContext);
  if (!context) throw new Error('useGame must be used inside GameProvider.');
  return context;
}
