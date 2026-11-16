'use client';

import { createContext, useContext } from 'react';

// Which admin frame a component is rendering inside while pages move to the
// 2027 paper look: AdminShell provides true on migrated routes. Components
// shared between a paper page and a still-dark one (or /hub, which sits
// outside AdminShell and so reads the default) pick their classes from it.
// Goes away with the legacy shell in the last phase.
const AdminPaperContext = createContext(false);

export const AdminPaperProvider = AdminPaperContext.Provider;

export function useAdminPaper() {
  return useContext(AdminPaperContext);
}
