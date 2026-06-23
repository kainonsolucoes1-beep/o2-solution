#!/bin/bash
set -e
cd ~/o2-solution
git pull
sudo docker-compose -f docker-compose.prod.yml build --no-cache
sudo docker-compose -f docker-compose.prod.yml down
sudo docker-compose -f docker-compose.prod.yml up -d
