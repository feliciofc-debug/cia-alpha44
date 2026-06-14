export interface User {
  nome: string;
  email: string;
}

export type AuthMode = "demo" | "clerk";

export interface AuthContextValue {
  mode: AuthMode;
  isLoaded: boolean;
  user: User | null;
  login: (email: string, senha: string) => Promise<void>;
  signup: (nome: string, email: string, senha: string) => Promise<void>;
  logout: () => void;
  /** JWT Clerk para Authorization Bearer; null em demo ou deslogado. */
  getToken?: () => Promise<string | null>;
}
