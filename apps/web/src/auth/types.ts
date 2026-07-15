export interface User {
  nome: string;
  email: string;
}

export interface AuthContextValue {
  isLoaded: boolean;
  user: User | null;
  login: (email: string, senha: string) => Promise<void>;
  logout: () => void;
  getToken?: () => Promise<string | null>;
}
