#!/bin/bash
set -e
cd ~/o2-solution
git pull
sudo docker rm -f $(sudo docker ps -aq --filter "name=o2-solution") 2>/dev/null || true
sudo docker-compose -f docker-compose.prod.yml up -d --build
