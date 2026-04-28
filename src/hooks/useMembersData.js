import React from 'react';

export function useMembersData(api) {
  const [health, setHealth] = React.useState('checking');
  const [members, setMembers] = React.useState([]);

  React.useEffect(() => {
    let mounted = true;
    api.health().then(() => mounted && setHealth('ok')).catch(() => mounted && setHealth('error'));
    api.listMembers().then((list) => {
      if (!mounted) return;
      setMembers(Array.isArray(list) ? list : []);
    }).catch(() => {
      if (!mounted) return;
      setMembers([]);
    });
    return () => {
      mounted = false;
    };
  }, [api]);

  const persistMembers = React.useCallback(async (next) => {
    setMembers(next);
    await api.saveMembers(next);
  }, [api]);

  return {
    health,
    members,
    setMembers,
    persistMembers
  };
}
