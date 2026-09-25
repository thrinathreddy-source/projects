#!/bin/bash
rsync -a --exclude='.git' --exclude='node_modules' --exclude='.next' \
  "$(dirname "$0")/" /tmp/mayatara-deploy/
cp -r "$(dirname "$0")/.vercel" /tmp/mayatara-deploy/.vercel
cd /tmp/mayatara-deploy && npx vercel --prod --yes
