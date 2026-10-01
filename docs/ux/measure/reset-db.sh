#!/usr/bin/env bash
# Restore the audit database to the pristine snapshot (siteops_audit_tpl) so every run starts from identical data.
export PGPASSWORD=siteops
psql -h localhost -U siteops -d postgres -qc "drop database if exists siteops_audit with (force)" -c "create database siteops_audit template siteops_audit_tpl"
