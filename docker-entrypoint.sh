#!/bin/sh
set -e
echo "Applying Prisma migrations..."
npx prisma migrate deploy
echo "Seeding sample hospitals if needed..."
npx prisma db seed
echo "Starting Hospital Compare on 43180..."
exec npm start
