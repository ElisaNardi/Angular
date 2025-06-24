import { DataSource } from "typeorm"
import * as dotenv from "dotenv"
// Importa tus entidades aquí. Asegúrate que las rutas sean correctas.
// Si tus entidades están en 'src/entities/restaurant/restaurant.entity',
// entonces la ruta `entities: [...]` más genérica debería ser suficiente.
import { Restaurant } from "./src/entities/restaurant/restaurant.entity"
import { Menu } from "./src/entities/menu/menu.entity"
import { UserEntity } from "./src/entities/user/user.entity"

dotenv.config() // ¡Esto es crucial! Carga las variables desde el .env

const AppDataSource = new DataSource({
  type: "postgres",
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || "5432", 10),
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE, // <-- ¡Esto ahora coincide con el .env y el docker-compose.yml!
  entities: [Restaurant, Menu, UserEntity], // Asegúrate de que estas entidades estén correctamente importadas y listadas.
  // Si usas el patrón 'src/**/*.entity{.ts,.js}', asegúrate que la ruta sea correcta desde la raíz del proyecto.
  synchronize: process.env.DB_SYNCHRONIZE === "true", // Lee de .env. true para crear/actualizar tablas en desarrollo.
  logging: true, // Esto te mostrará logs útiles de TypeORM
  migrations: [__dirname + "/migrations/**/*.ts"], // Ruta a tus migraciones
  // --- Importante: Deshabilita SSL para conexiones locales a Docker ---
  ssl: false,
  extra: {
    ssl: {
      rejectUnauthorized: false, // Aunque ssl:false, es buena práctica si lo habilitas en el futuro
    },
  },
  // Otros parámetros de configuración si los necesitas, como poolSize, connectTimeoutMS, etc.
})

// Inicializa la conexión y maneja los errores
AppDataSource.initialize()
  .then(() => {
    console.log("Conexión a la base de datos establecida exitosamente.")
    // Aquí podrías ejecutar migraciones si no usas synchronize
  })
  .catch((error) => {
    console.error("Error al conectar a la base de datos:", error)
    // Podrías lanzar el error o salir de la aplicación si la DB es crítica
    // process.exit(1);
  })

export default AppDataSource
