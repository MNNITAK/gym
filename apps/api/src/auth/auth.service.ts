import { Injectable, UnauthorizedException } from "@nestjs/common";
import bcrypt from "bcryptjs";
import { DbService } from "../db/db.service.js";
import { signToken } from "./jwt.util.js";

@Injectable()
export class AuthService {
  constructor(private readonly db: DbService) {}

  /**
   * Staff login. If a user has no password hash yet (freshly seeded), we allow a
   * dev login in non-production so the demo loop is runnable; production requires a hash.
   */
  async login(email: string, password: string) {
    const user = await this.db.repos.staff.findByEmail(email);
    if (!user) throw new UnauthorizedException("Invalid credentials");

    if (user.passwordHash) {
      const ok = await bcrypt.compare(password, user.passwordHash);
      if (!ok) throw new UnauthorizedException("Invalid credentials");
    } else if (process.env.NODE_ENV === "production") {
      throw new UnauthorizedException("Password not set");
    }

    const token = signToken({
      sub: user.id,
      gymId: user.gymId,
      role: user.role,
      email: user.email,
    });
    return {
      token,
      user: { id: user.id, name: user.name, role: user.role, gymId: user.gymId },
    };
  }
}
