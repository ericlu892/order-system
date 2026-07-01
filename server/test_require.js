// 专用于调试：完整加载 server_new.js 但看看哪行卡住
const { createDatabase } = require('./sqlite_compat');
const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');

console.log('ALL MODULES LOADED OK');
process.exit(0);
