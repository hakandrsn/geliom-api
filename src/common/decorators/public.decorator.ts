import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * @Public() decorator - JWT authentication bypass
 * Bu decorator ile işaretlenen endpoint'ler auth gerektirmez
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
