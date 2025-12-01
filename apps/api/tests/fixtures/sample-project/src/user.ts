// User module

export interface User {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  createdAt: Date;
}

export interface CreateUserInput {
  email: string;
  name: string;
  password: string;
}

export class UserService {
  private users: Map<string, User> = new Map();

  async createUser(input: CreateUserInput): Promise<User> {
    const id = crypto.randomUUID();
    const user: User = {
      id,
      email: input.email,
      name: input.name,
      passwordHash: await this.hashPassword(input.password),
      createdAt: new Date(),
    };
    this.users.set(id, user);
    return user;
  }

  async getUserById(id: string): Promise<User | null> {
    return this.users.get(id) || null;
  }

  async getUserByEmail(email: string): Promise<User | null> {
    for (const user of this.users.values()) {
      if (user.email === email) {
        return user;
      }
    }
    return null;
  }

  async updateUser(id: string, updates: Partial<User>): Promise<User | null> {
    const user = this.users.get(id);
    if (!user) return null;

    const updated = { ...user, ...updates };
    this.users.set(id, updated);
    return updated;
  }

  async deleteUser(id: string): Promise<boolean> {
    return this.users.delete(id);
  }

  private async hashPassword(password: string): Promise<string> {
    // simplified hash
    return btoa(password);
  }
}
