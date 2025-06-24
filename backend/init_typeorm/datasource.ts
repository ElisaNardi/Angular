import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import { Restaurant } from './src/entities/restaurant/restaurant.entity';
import { Menu } from './src/entities/menu/menu.entity';
import { UserEntity } from './src/entities/user/user.entity';

dotenv.config();

const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432', 10),
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  entities: [Restaurant, Menu, UserEntity],
  synchronize: process.env.DB_SYNCHRONIZE === 'true',
  logging: true,
  migrations: [__dirname + '/migrations/**/*.ts'],
});

export default AppDataSource;