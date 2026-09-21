import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { JwtPayload } from './auth.service';
import { AuthenticatedRequest } from './jwt-auth.guard';

export const CurrentUser = createParamDecorator((_data: unknown, context: ExecutionContext) => {
  const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
  return request.user as JwtPayload;
});
