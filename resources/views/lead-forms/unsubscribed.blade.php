<!doctype html>
<html lang="lv">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Jaunumu saņemšana</title></head>
<body>
<main>
@if ($found)
<h1>Jūs esat atteicies no jaunumu saņemšanas.</h1>
<p>Šī uzņēmuma jaunumus un īpašos piedāvājumus uz Jūsu adresi vairs nesūtīsim.</p>
<p lang="en">You have unsubscribed from this business’s emails.</p>
@else
<h1>Atteikšanās saite nav derīga.</h1>
<p lang="en">This unsubscribe link is not valid.</p>
@endif
</main>
</body>
</html>
