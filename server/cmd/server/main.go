package main

import (
	"database/sql"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"

	dbpkg "ccf-directory/db"
	"ccf-directory/internal/handler"
	"ccf-directory/internal/middleware"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	_ "github.com/mattn/go-sqlite3"
)

func main() {
	dbPath := os.Getenv("DB_PATH")
	if dbPath == "" {
		dbPath = "./data/ccf.db"
	}
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	frontendDir := os.Getenv("FRONTEND_DIR")
	if frontendDir == "" {
		frontendDir = "./frontend"
	}
	schemaPath := os.Getenv("SCHEMA_PATH")
	if schemaPath == "" {
		schemaPath = "./db/schema.sql"
	}

	// Ensure data directory exists
	dataDir := filepath.Dir(dbPath)
	if err := os.MkdirAll(dataDir, 0755); err != nil {
		log.Fatalf("Failed to create data directory: %v", err)
	}

	// Open database
	db, err := sql.Open("sqlite3", dbPath+"?_journal_mode=WAL&_foreign_keys=1")
	if err != nil {
		log.Fatalf("Failed to open database: %v", err)
	}
	defer db.Close()

	// Run schema
	schemaSQL, err := os.ReadFile(schemaPath)
	if err != nil {
		log.Fatalf("Failed to read schema: %v", err)
	}
	if _, err := db.Exec(string(schemaSQL)); err != nil {
		log.Fatalf("Failed to initialize schema: %v", err)
	}
	log.Println("Database initialized")

	// Run migrations for existing databases
	runMigrations(db)

	// Import data if available
	importPath := os.Getenv("IMPORT_PATH")
	if importPath == "" {
		importPath = "./db/import_data.json"
	}
	if _, err := os.Stat(importPath); err == nil {
		if err := dbpkg.ImportFromJSON(db, importPath); err != nil {
			log.Printf("Warning: import failed: %v", err)
		}
	}

	// Setup Gin
	r := gin.Default()

	// CORS
	r.Use(cors.New(cors.Config{
		AllowOrigins:     []string{"*"},
		AllowMethods:     []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Authorization"},
		ExposeHeaders:    []string{"Content-Length"},
	}))

	// API routes
	h := handler.New(db)
	api := r.Group("/api")
	api.Use(middleware.AuthMiddleware())
	h.RegisterRoutes(api)

	// Serve frontend static files (Vite build output)
	r.Static("/assets", filepath.Join(frontendDir, "assets"))
	r.StaticFile("/", filepath.Join(frontendDir, "index.html"))
	r.StaticFile("/favicon.svg", filepath.Join(frontendDir, "favicon.svg"))
	r.StaticFile("/favicon.ico", filepath.Join(frontendDir, "favicon.ico"))
	r.StaticFile("/apple-touch-icon.png", filepath.Join(frontendDir, "apple-touch-icon.png"))

	// SPA fallback for unknown routes
	r.NoRoute(func(c *gin.Context) {
		c.File(filepath.Join(frontendDir, "index.html"))
	})

	addr := fmt.Sprintf(":%s", port)
	log.Printf("Server starting at http://localhost%s", addr)
	log.Printf("Frontend dir: %s", frontendDir)
	log.Printf("Database: %s", dbPath)
	if err := r.Run(addr); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}

func runMigrations(db *sql.DB) {
	migrations := []string{
		"ALTER TABLE favorites ADD COLUMN tags TEXT NOT NULL DEFAULT '[]'",
		"ALTER TABLE favorites ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE CASCADE",
	}
	for _, m := range migrations {
		if _, err := db.Exec(m); err != nil {
			// Column already exists is expected for new databases
			if !strings.Contains(err.Error(), "duplicate column name") {
				log.Printf("Migration warning: %v", err)
			}
		}
	}
	log.Println("Migrations applied")
}
