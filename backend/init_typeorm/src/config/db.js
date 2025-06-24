// src/config/db.js (o donde lo hayas ubicado)

const { Pool } = require("pg")

// Configuración de la conexión a la base de datos
const pool = new Pool({
  user: "usuario", // Coincide con POSTGRES_USER en docker-compose.yml
  host: "localhost", // SI TU BACKEND NO ESTÁ DENTRO DE DOCKER COMPOSE.
  // Si tu backend también estuviera en el mismo docker-compose.yml
  // y en la misma red de Docker, usarías 'db' como host.
  database: "basededatos", // Coincide con POSTGRES_DB en docker-compose.yml
  password: "password123", // Coincide con POSTGRES_PASSWORD en docker-compose.yml
  port: 5432, // El puerto mapeado en docker-compose.yml
})

// Función para ejecutar consultas (ej. SELECT, INSERT, UPDATE, DELETE)
// Usaremos esta función para interactuar con la DB
const query = (text, params) => pool.query(text, params)

// Función para probar la conexión al inicio de la aplicación
async function testDbConnection() {
  try {
    const client = await pool.connect()
    console.log("✔ Conexión exitosa a PostgreSQL!")
    const result = await client.query("SELECT NOW() as current_time")
    console.log(
      "  Hora actual de la base de datos:",
      result.rows[0].current_time
    )
    client.release() // Libera el cliente de vuelta al pool
  } catch (err) {
    console.error("✖ Error al conectar a la base de datos:", err.message)
    // Opcional: Podrías querer salir de la aplicación si no se conecta a la DB al inicio
    // process.exit(1);
  }
}

// Exporta el pool y la función de query para usarlos en tus controladores/modelos
module.exports = {
  query,
  testDbConnection,
}
