
export interface PublicUser {
  id: string;
  username: string;
  email: string;
}

export interface RegisteredUser extends PublicUser {
  createdAt: string;
}
