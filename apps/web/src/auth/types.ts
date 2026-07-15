export interface User {
  nome: string;
  email: string;
  role?: "admin" | "operador";
}

export interface AuthContextValue {
  isLoaded: boolean;
  user: User | null;
  login: (email: string, senha: string) => Promise<void>;
  register: (nome: string, email: string, senha: string) => Promise<string>;
  logout: () => void;
  getToken?: () => Promise<string | null>;
}
