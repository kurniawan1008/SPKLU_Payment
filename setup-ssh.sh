#!/bin/bash
mkdir -p ~/.ssh
chmod 700 ~/.ssh
echo 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOX3AE+nXllq9miq+++oGFPfzh+xpqavSXPa07D5u/CJ claude@local' >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
echo "SSH key added successfully"
