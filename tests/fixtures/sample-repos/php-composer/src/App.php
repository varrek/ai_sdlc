<?php

namespace App;

final class App
{
    public function greet(string $name): string
    {
        return "Hello, {$name}";
    }
}
