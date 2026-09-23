# ============================================================
# C2 Platform – Dockerfile
# Stage 1 : Build React / TypeScript frontend
# Stage 2 : Production image (Node.js + Ansible + Terraform)
# ============================================================

# ── Stage 1: Builderr ────────────────────────────────────────
FROM node:22-bookworm-slim AS builder

WORKDIR /app

# Copy package manifests and install ALL dependencies (including devDeps for build)
COPY package.json package-lock.json ./
RUN npm ci

# Copy the full source and build the frontend
COPY . .
RUN npm run build


# ── Stage 2: Production runtime ─────────────────────────────
FROM node:22-bookworm-slim AS production

# ---- System tools ----
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    unzip \
    gnupg \
    git \
    openssh-client \
    python3 \
    python3-pip \
    python3-venv \
    # Required by psycopg2 (community.postgresql collection)
    libpq-dev \
    python3-dev \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# ---- Ansible + Collections ----
RUN python3 -m venv /opt/ansible-env \
 && /opt/ansible-env/bin/pip install --no-cache-dir ansible psycopg2-binary \
 && ln -s /opt/ansible-env/bin/ansible         /usr/local/bin/ansible \
 && ln -s /opt/ansible-env/bin/ansible-playbook /usr/local/bin/ansible-playbook \
 && ln -s /opt/ansible-env/bin/ansible-galaxy   /usr/local/bin/ansible-galaxy \
 && ansible --version

# Install Ansible Galaxy collections declared in requirements.yml
# To add more collections: edit backend/ansible/requirements.yml and rebuild the image
COPY backend/ansible/requirements.yml /tmp/ansible-requirements.yml
RUN ansible-galaxy collection install -r /tmp/ansible-requirements.yml \
 && echo "✅ Ansible collections installed"

# ---- Terraform ----
ARG TERRAFORM_VERSION=1.9.8
RUN curl -fsSL "https://releases.hashicorp.com/terraform/${TERRAFORM_VERSION}/terraform_${TERRAFORM_VERSION}_linux_amd64.zip" -o /tmp/terraform.zip \
 && unzip /tmp/terraform.zip -d /usr/local/bin/ \
 && rm /tmp/terraform.zip \
 && terraform version

# ---- App workspace ----
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY backend/ ./backend/
COPY --from=builder /app/dist ./dist

RUN mkdir -p /app/data

# ---- Environment defaults ----
ENV NODE_ENV=production \
    PORT=5000 \
    CORS_ORIGIN=*

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD curl -fsSL http://localhost:5000/api/health || exit 1

CMD ["node", "backend/index.js"]
