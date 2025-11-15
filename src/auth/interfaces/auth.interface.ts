export interface JwtPayload {
  sub: string; // userId
  email: string;
  type: 'access' | 'refresh';
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    name: string | null;
    wallets: Array<{
      address: string;
      network: string;
      currency: string;
      isDefault: boolean;
    }>;
  };
}
