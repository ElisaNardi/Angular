import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { GeorefModule } from './georef/georef.module';
import { RestaurantModule } from './restaurants/restaurants.module';
import { MenuModule } from './menus/menus.module';
import { AuthModule } from './auth/auth.module';
import { UserEntity } from './entities/user/user.entity';
import { Restaurant } from './entities/restaurant/restaurant.entity';
import { Menu } from './entities/menu/menu.entity';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get<string>('DB_HOST'),
        port: parseInt(configService.get<string>('DB_PORT') as string, 10) || 5432,
        username: configService.get<string>('DB_USERNAME'),
        password: configService.get<string>('DB_PASSWORD'),
        database: configService.get<string>('DB_DATABASE'),
        entities: [UserEntity, Restaurant, Menu],
        synchronize: configService.get<string>('DB_SYNCHRONIZE') === 'true',
        logging: true,
      }),
    }),
    GeorefModule,
    RestaurantModule,
    MenuModule,
    AuthModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}