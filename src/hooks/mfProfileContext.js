import { createContext, useContext } from 'react';

/**
 * Perfil ativo do módulo Minhas Finanças (Fase 9).
 *
 * O valor é o **id do perfil** (`string`) ou `null` = "Todos os perfis"
 * (sem filtro — comportamento anterior). O contexto também é `null` fora
 * do provider, então telas/testes montados fora dele mantêm o escopo
 * atual sem nenhuma mudança de comportamento.
 */
export const MFProfileContext = createContext(null);

/** Id do perfil ativo (null = todos). */
export const useMFProfileScope = () => useContext(MFProfileContext);
