.PHONY: install dev seed start clean

# Install dependencies + copy env if needed
install:
	@test -f .env.local || (cp .env.local.dist .env.local && echo "Created .env.local from .env.local.dist")
	npm install

# Start both frontend + Convex backend (main dev command)
dev:
	npm run dev

# Seed demo user with 1000 credits and 10x10 grid
seed:
	npx convex run seed:seedDemo '{"width": 10, "height": 10}'

# First-time setup: install, start dev, seed
start: install
	@echo "Starting Pixagora..."
	@echo "1. Run 'make dev' in one terminal"
	@echo "2. Run 'make seed' in another terminal"
	@echo "3. Open http://localhost:3000/canvas"
	@echo "4. Login with: demo-token-12345"

# Build for production
build:
	npm run build

# Clean node_modules
clean:
	rm -rf node_modules .next
