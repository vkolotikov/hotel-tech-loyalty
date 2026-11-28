<?php

$launchPublic = dirname(__DIR__, 2) . '/public';
$launchUri = rawurldecode(parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH) ?? '/');
if ($launchUri !== '/' && is_file($launchPublic . $launchUri)) {
    return false;
}
$launchApp = require __DIR__ . '/launch-app.php';
$launchApp->handleRequest(\Illuminate\Http\Request::capture());
