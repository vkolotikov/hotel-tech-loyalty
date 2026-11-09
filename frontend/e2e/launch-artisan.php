<?php

$launchApp = require __DIR__ . '/launch-app.php';
exit($launchApp->handleCommand(new \Symfony\Component\Console\Input\ArgvInput));
