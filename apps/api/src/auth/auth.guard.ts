import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import type { Request } from "express";
import type { TenantContext } from "@keystone/core";
import { verifyToken } from "./jwt.util.js";

export interface AuthedRequest extends Request {
  tenant: TenantContext & { role: string; email: string };
}

/**
 * Authenticates staff via Bearer JWT and attaches the TenantContext to the request.
 * Every controller that touches member data scopes queries by req.tenant.gymId —
 * that gymId comes from the signed token, never from client input.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      throw new UnauthorizedException("Missing bearer token");
    }
    try {
      const claims = verifyToken(header.slice(7));
      req.tenant = {
        gymId: claims.gymId,
        staffUserId: claims.sub,
        role: claims.role,
        email: claims.email,
      };
      return true;
    } catch {
      throw new UnauthorizedException("Invalid token");
    }
  }
}
