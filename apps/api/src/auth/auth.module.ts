import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { cargarEntorno } from '../config/entorno';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { TokensService } from './tokens.service';

@Module({
  imports: [
    JwtModule.registerAsync({
      useFactory: () => {
        const env = cargarEntorno();
        return {
          secret: env.JWT_SECRET,
          signOptions: { issuer: 'pr-lab', expiresIn: env.JWT_ACCESS_TTL },
          verifyOptions: { issuer: 'pr-lab' },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, TokensService],
  exports: [AuthService, TokensService],
})
export class AuthModule {}
