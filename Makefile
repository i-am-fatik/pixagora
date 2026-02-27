.PHONY: install dev seed start clean db-clear db-reset

# Install dependencies + copy env if needed
install:
	@test -f .env.local || (cp .env.local.dist .env.local && echo "Created .env.local from .env.local.dist")
	npm install

# Start both frontend + Convex backend (main dev command)
dev:
	npm run dev

# Seed demo users
seed:
	npx convex run seed:seedDemo '{}'

# First-time setup: install, start dev, seed
start: install
	@echo "Starting PixAgora..."
	@echo "1. Run 'make dev' in one terminal"
	@echo "2. Run 'make seed' in another terminal (tokens will be printed)"
	@echo "3. Open http://localhost:3000/canvas"

# Build for production
build:
	npm run build

# Clear all data from Convex DB
db-clear:
	npx convex run seed:clearAll '{}'

# Clear DB and re-seed with demo data
db-reset:
	npx convex run seed:clearAll '{}'
	npx convex run seed:seedDemo '{}'

# Clean node_modules
clean:
	rm -rf node_modules .next
