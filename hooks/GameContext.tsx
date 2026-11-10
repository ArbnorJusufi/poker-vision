import { PropsWithChildren, createContext, useContext, useMemo, useState } from 'react';
import { Card, Player } from '@/types/poker';

interface GameContextValue {
  community: Card[];
  players: Player[];
  setCommunity: (cards: Card[]) => void;
  addPlayer: () => void;
  updatePlayer: (id: string, patch: Partial<Omit<Player, 'id'>>) => void;
  removePlayer: (id: string) => void;
  reset: () => void;
}

const GameContext = createContext<GameContextValue | null>(null);
const createPlayer = (number: number): Player => ({
  id: `${Date.now()}-${number}`,
  name: `Player ${number}`,
  cards: [],
});

export function GameProvider({ children }: PropsWithChildren) {
  const [community, setCommunity] = useState<Card[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);

  const value = useMemo<GameContextValue>(() => ({
    community,
    players,
    setCommunity,
    addPlayer: () => setPlayers((current) => [...current, createPlayer(current.length + 1)]),
    updatePlayer: (id, patch) =>
      setPlayers((current) => current.map((player) => player.id === id ? { ...player, ...patch } : player)),
    removePlayer: (id) => setPlayers((current) => current.filter((player) => player.id !== id)),
    reset: () => {
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
