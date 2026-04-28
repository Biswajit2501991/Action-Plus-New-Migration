import React from 'react';

export default function MemberActionsModule({ memberId, onEdit, onCompose }) {
  return (
    <>
      <button onClick={() => onEdit(memberId)}>Edit</button>{' '}
      <button onClick={() => onCompose(memberId)}>Compose</button>
    </>
  );
}
