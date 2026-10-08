import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'tests/browser',workers:1,fullyParallel:false,timeout:30_000,use:{browserName:'chromium',headless:true,viewport:{width:1365,height:950}},reporter:'list'});
