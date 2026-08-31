[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$script:Errors = New-Object 'System.Collections.Generic.List[string]'
$script:Warnings = New-Object 'System.Collections.Generic.List[string]'
$script:ProjectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$collectionRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$templatesRoot = Join-Path $collectionRoot 'templates'

$expectedTemplates = @(
    '01-nocturne-ritual',
    '02-editorial-atelier',
    '03-organic-wellness'
)

$blockVocabulary = @(
    'announcement',
    'header',
    'hero',
    'trust',
    'services',
    'story',
    'gallery',
    'team',
    'testimonials',
    'feedback',
    'faq',
    'booking',
    'contact',
    'footer',
    'assistant'
)

$requiredBlocks = @('header', 'hero', 'services', 'booking', 'contact', 'footer')
$requiredActions = @('open-booking', 'open-feedback')
$requiredEntries = @('index.html', 'style.css', 'assets', 'notes.md')

function Get-DisplayPath {
    param([Parameter(Mandatory = $true)][string]$Path)

    $fullPath = [System.IO.Path]::GetFullPath($Path)
    $prefix = $script:ProjectRoot.TrimEnd(
        [System.IO.Path]::DirectorySeparatorChar,
        [System.IO.Path]::AltDirectorySeparatorChar
    ) + [System.IO.Path]::DirectorySeparatorChar

    if ($fullPath.StartsWith($prefix, [System.StringComparison]::OrdinalIgnoreCase)) {
        return $fullPath.Substring($prefix.Length).Replace('\', '/')
    }

    return $fullPath
}

function Get-LineNumber {
    param(
        [Parameter(Mandatory = $true)][string]$Text,
        [Parameter(Mandatory = $true)][int]$Index
    )

    if ($Index -le 0) {
        return 1
    }

    return 1 + [System.Text.RegularExpressions.Regex]::Matches(
        $Text.Substring(0, $Index),
        "`r`n|`n|`r"
    ).Count
}

function Mask-HtmlComments {
    param([Parameter(Mandatory = $true)][string]$Html)

    $characters = $Html.ToCharArray()
    $commentMatches = [System.Text.RegularExpressions.Regex]::Matches(
        $Html,
        '<!--.*?-->',
        [System.Text.RegularExpressions.RegexOptions]::Singleline
    )
    foreach ($comment in $commentMatches) {
        for ($index = $comment.Index; $index -lt ($comment.Index + $comment.Length); $index++) {
            if (($characters[$index] -ne "`r") -and ($characters[$index] -ne "`n")) {
                $characters[$index] = ' '
            }
        }
    }

    return -join $characters
}

function Add-ValidationError {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [int]$Line = 0,
        [Parameter(Mandatory = $true)][string]$Message
    )

    $location = Get-DisplayPath -Path $Path
    if ($Line -gt 0) {
        $location = "${location}:$Line"
    }
    [void]$script:Errors.Add("$location - $Message")
}

function Add-ValidationWarning {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [int]$Line = 0,
        [Parameter(Mandatory = $true)][string]$Message
    )

    $location = Get-DisplayPath -Path $Path
    if ($Line -gt 0) {
        $location = "${location}:$Line"
    }
    [void]$script:Warnings.Add("$location - $Message")
}

function Get-HtmlAttributeMatches {
    param(
        [Parameter(Mandatory = $true)][string]$Html,
        [Parameter(Mandatory = $true)][string]$AttributeName
    )

    $name = [System.Text.RegularExpressions.Regex]::Escape($AttributeName)
    $pattern = '(?is)(?<![-:\w])' + $name + '\s*=\s*(?:"(?<value>[^"]*)"|''(?<value>[^'']*)''|(?<value>[^\s>]+))'
    return [System.Text.RegularExpressions.Regex]::Matches($Html, $pattern)
}

function Mask-CssComments {
    param([Parameter(Mandatory = $true)][string]$Css)

    $characters = $Css.ToCharArray()
    $commentMatches = [System.Text.RegularExpressions.Regex]::Matches(
        $Css,
        '/\*.*?\*/',
        [System.Text.RegularExpressions.RegexOptions]::Singleline
    )

    foreach ($comment in $commentMatches) {
        for ($index = $comment.Index; $index -lt ($comment.Index + $comment.Length); $index++) {
            if (($characters[$index] -ne "`r") -and ($characters[$index] -ne "`n")) {
                $characters[$index] = ' '
            }
        }
    }

    return -join $characters
}

function Mask-CssRootAndComments {
    param(
        [Parameter(Mandatory = $true)][string]$Css,
        [Parameter(Mandatory = $true)][string]$SourcePath
    )

    $scanText = Mask-CssComments -Css $Css
    $characters = $scanText.ToCharArray()
    $rootPattern = New-Object System.Text.RegularExpressions.Regex(
        ':root\s*\{',
        [System.Text.RegularExpressions.RegexOptions]::IgnoreCase
    )
    $searchIndex = 0

    while ($searchIndex -lt $scanText.Length) {
        $rootMatch = $rootPattern.Match($scanText, $searchIndex)
        if (-not $rootMatch.Success) {
            break
        }

        $depth = 1
        $cursor = $rootMatch.Index + $rootMatch.Length
        while (($cursor -lt $scanText.Length) -and ($depth -gt 0)) {
            if ($scanText[$cursor] -eq '{') {
                $depth++
            }
            elseif ($scanText[$cursor] -eq '}') {
                $depth--
            }
            $cursor++
        }

        if ($depth -ne 0) {
            # Leave malformed CSS visible to the later checks and report the root issue.
            Add-ValidationError -Path $SourcePath -Message 'Unclosed :root block prevents reliable token validation.'
            break
        }

        for ($index = $rootMatch.Index; $index -lt $cursor; $index++) {
            if (($characters[$index] -ne "`r") -and ($characters[$index] -ne "`n")) {
                $characters[$index] = ' '
            }
        }
        $searchIndex = $cursor
    }

    return -join $characters
}

function Test-LocalReference {
    param(
        [Parameter(Mandatory = $true)][string]$Reference,
        [Parameter(Mandatory = $true)][string]$SourcePath,
        [Parameter(Mandatory = $true)][int]$Line,
        [Parameter(Mandatory = $true)][string]$TemplateRoot
    )

    $decoded = [System.Net.WebUtility]::HtmlDecode($Reference).Trim()
    if ([string]::IsNullOrWhiteSpace($decoded)) {
        Add-ValidationError -Path $SourcePath -Line $Line -Message 'Empty local asset reference.'
        return
    }

    if ($decoded -match '^(?i)(?:[a-z][a-z0-9+.-]*:|//|#)') {
        return
    }

    $cleanReference = ($decoded -split '[?#]', 2)[0]
    if ([string]::IsNullOrWhiteSpace($cleanReference)) {
        return
    }

    try {
        $cleanReference = [System.Uri]::UnescapeDataString($cleanReference)
    }
    catch {
        Add-ValidationError -Path $SourcePath -Line $Line -Message "Invalid escaped local reference '$Reference'."
        return
    }

    $baseDirectory = Split-Path -Parent $SourcePath
    if ($cleanReference.StartsWith('/') -or $cleanReference.StartsWith('\')) {
        $candidate = Join-Path $TemplateRoot $cleanReference.TrimStart('/', '\')
    }
    else {
        $candidate = Join-Path $baseDirectory $cleanReference
    }

    try {
        $candidate = [System.IO.Path]::GetFullPath($candidate)
    }
    catch {
        Add-ValidationError -Path $SourcePath -Line $Line -Message "Invalid local path '$Reference'."
        return
    }

    $templatePrefix = $TemplateRoot.TrimEnd(
        [System.IO.Path]::DirectorySeparatorChar,
        [System.IO.Path]::AltDirectorySeparatorChar
    ) + [System.IO.Path]::DirectorySeparatorChar

    if (-not $candidate.StartsWith($templatePrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
        Add-ValidationError -Path $SourcePath -Line $Line -Message "Local reference '$Reference' escapes its template kit."
        return
    }

    if (-not (Test-Path -LiteralPath $candidate -PathType Leaf)) {
        Add-ValidationError -Path $SourcePath -Line $Line -Message "Missing local asset '$Reference'."
    }
}

function Test-HtmlFile {
    param(
        [Parameter(Mandatory = $true)][string]$IndexPath,
        [Parameter(Mandatory = $true)][string]$TemplateRoot
    )

    $html = [System.IO.File]::ReadAllText($IndexPath)
    $htmlForValidation = Mask-HtmlComments -Html $html
    $forbiddenPatterns = @(
        @{ Pattern = '<script\b'; Message = 'Script elements are forbidden; the host application owns behaviour.' },
        @{ Pattern = '<style\b'; Message = 'Inline style elements are forbidden; use style.css.' },
        @{ Pattern = '(?<![-:\w])style\s*='; Message = 'Inline style attributes are forbidden.' },
        @{ Pattern = '(?<![-:\w])on[a-z][a-z0-9:_-]*\s*='; Message = 'Inline DOM event-handler attributes are forbidden.' },
        @{ Pattern = 'javascript\s*:'; Message = 'javascript: URLs are forbidden.' }
    )

    foreach ($rule in $forbiddenPatterns) {
        $matches = [System.Text.RegularExpressions.Regex]::Matches(
            $htmlForValidation,
            $rule.Pattern,
            [System.Text.RegularExpressions.RegexOptions]::IgnoreCase
        )
        foreach ($match in $matches) {
            Add-ValidationError -Path $IndexPath -Line (Get-LineNumber -Text $html -Index $match.Index) -Message $rule.Message
        }
    }

    $blockMatches = Get-HtmlAttributeMatches -Html $htmlForValidation -AttributeName 'data-block'
    $blockValues = @($blockMatches | ForEach-Object { $_.Groups['value'].Value.Trim().ToLowerInvariant() })
    foreach ($requiredBlock in $requiredBlocks) {
        if ($blockValues -notcontains $requiredBlock) {
            Add-ValidationError -Path $IndexPath -Message "Missing required data-block='$requiredBlock'."
        }
    }

    foreach ($blockMatch in $blockMatches) {
        $rawBlockValue = $blockMatch.Groups['value'].Value
        $blockValue = $rawBlockValue.Trim().ToLowerInvariant()
        if ($rawBlockValue -cne $blockValue) {
            Add-ValidationError -Path $IndexPath -Line (Get-LineNumber -Text $html -Index $blockMatch.Index) -Message "data-block values must use exact lowercase vocabulary; found '$rawBlockValue'."
        }
        if ($blockVocabulary -notcontains $blockValue) {
            Add-ValidationError -Path $IndexPath -Line (Get-LineNumber -Text $html -Index $blockMatch.Index) -Message "Unknown data-block value '$blockValue'."
        }
    }

    $optionalBlocks = @($blockVocabulary | Where-Object { $requiredBlocks -notcontains $_ })
    $missingOptionalBlocks = @($optionalBlocks | Where-Object { $blockValues -notcontains $_ })
    if ($missingOptionalBlocks.Count -gt 0) {
        Add-ValidationWarning -Path $IndexPath -Message ('Optional block vocabulary not demonstrated here: ' + ($missingOptionalBlocks -join ', ') + '.')
    }

    $actionMatches = Get-HtmlAttributeMatches -Html $htmlForValidation -AttributeName 'data-action'
    $actionValues = @($actionMatches | ForEach-Object { $_.Groups['value'].Value.Trim().ToLowerInvariant() })
    foreach ($requiredAction in $requiredActions) {
        if ($actionValues -notcontains $requiredAction) {
            Add-ValidationError -Path $IndexPath -Message "Missing required data-action='$requiredAction'."
        }
    }
    foreach ($actionMatch in $actionMatches) {
        $rawActionValue = $actionMatch.Groups['value'].Value
        $actionValue = $rawActionValue.Trim().ToLowerInvariant()
        if ($rawActionValue -cne $actionValue) {
            Add-ValidationError -Path $IndexPath -Line (Get-LineNumber -Text $html -Index $actionMatch.Index) -Message "data-action values must be lowercase without surrounding whitespace; found '$rawActionValue'."
        }
    }

    if ($htmlForValidation -notmatch '(?i)(?<![-:\w])data-ai-widget-slot(?=[\s=>])') {
        Add-ValidationError -Path $IndexPath -Message 'Missing reserved data-ai-widget-slot footer mount point.'
    }

    $actionElementMatches = [System.Text.RegularExpressions.Regex]::Matches(
        $htmlForValidation,
        '<(?:a|button)\b[^>]*>',
        [System.Text.RegularExpressions.RegexOptions]::IgnoreCase -bor [System.Text.RegularExpressions.RegexOptions]::Singleline
    )
    foreach ($actionElementMatch in $actionElementMatches) {
        $classAttributes = @(Get-HtmlAttributeMatches -Html $actionElementMatch.Value -AttributeName 'class')
        if (($classAttributes.Count -ne 1) -or ((@($classAttributes[0].Groups['value'].Value -split '\s+') -notcontains 'button'))) {
            continue
        }

        $styledActionValues = @(Get-HtmlAttributeMatches -Html $actionElementMatch.Value -AttributeName 'data-action')
        if (($styledActionValues.Count -ne 1) -or ($styledActionValues[0].Groups['value'].Value -ne 'open-booking')) {
            Add-ValidationError -Path $IndexPath -Line (Get-LineNumber -Text $html -Index $actionElementMatch.Index) -Message 'Button-styled actions are reserved for data-action=''open-booking''.'
        }
    }

    $idMatches = Get-HtmlAttributeMatches -Html $htmlForValidation -AttributeName 'id'
    $idGroups = $idMatches | Group-Object { $_.Groups['value'].Value }
    foreach ($idGroup in $idGroups) {
        if (($idGroup.Name.Length -gt 0) -and ($idGroup.Count -gt 1)) {
            $firstMatch = $idGroup.Group[0]
            Add-ValidationError -Path $IndexPath -Line (Get-LineNumber -Text $html -Index $firstMatch.Index) -Message "Duplicate HTML id '$($idGroup.Name)' appears $($idGroup.Count) times."
        }
    }

    $idValues = @($idMatches | ForEach-Object { $_.Groups['value'].Value })
    $hrefMatches = Get-HtmlAttributeMatches -Html $htmlForValidation -AttributeName 'href'
    foreach ($hrefMatch in $hrefMatches) {
        $hrefValue = [System.Net.WebUtility]::HtmlDecode($hrefMatch.Groups['value'].Value).Trim()
        if (($hrefValue -match '^#(?<fragment>.+)$') -and ($idValues -notcontains $Matches['fragment'])) {
            Add-ValidationError -Path $IndexPath -Line (Get-LineNumber -Text $html -Index $hrefMatch.Index) -Message "Local fragment '$hrefValue' has no matching id."
        }
    }

    $imageMatches = [System.Text.RegularExpressions.Regex]::Matches(
        $htmlForValidation,
        '<img\b[^>]*>',
        [System.Text.RegularExpressions.RegexOptions]::IgnoreCase -bor [System.Text.RegularExpressions.RegexOptions]::Singleline
    )
    foreach ($imageMatch in $imageMatches) {
        $line = Get-LineNumber -Text $html -Index $imageMatch.Index
        $widthMatches = @(Get-HtmlAttributeMatches -Html $imageMatch.Value -AttributeName 'width')
        $heightMatches = @(Get-HtmlAttributeMatches -Html $imageMatch.Value -AttributeName 'height')
        $hasWidth = ($widthMatches.Count -eq 1) -and ($widthMatches[0].Groups['value'].Value -match '^\d+$')
        $hasHeight = ($heightMatches.Count -eq 1) -and ($heightMatches[0].Groups['value'].Value -match '^\d+$')
        if (-not ($hasWidth -and $hasHeight)) {
            Add-ValidationError -Path $IndexPath -Line $line -Message 'Every img element needs numeric width and height attributes.'
        }
    }

    $sourceMatches = [System.Text.RegularExpressions.Regex]::Matches(
        $htmlForValidation,
        '(?is)(?<![-:\w])(?:src|poster)\s*=\s*(?:"(?<value>[^"]*)"|''(?<value>[^'']*)''|(?<value>[^\s>]+))'
    )
    foreach ($sourceMatch in $sourceMatches) {
        Test-LocalReference -Reference $sourceMatch.Groups['value'].Value -SourcePath $IndexPath -Line (Get-LineNumber -Text $html -Index $sourceMatch.Index) -TemplateRoot $TemplateRoot
    }

    $linkTagMatches = [System.Text.RegularExpressions.Regex]::Matches(
        $htmlForValidation,
        '<link\b[^>]*>',
        [System.Text.RegularExpressions.RegexOptions]::IgnoreCase -bor [System.Text.RegularExpressions.RegexOptions]::Singleline
    )
    foreach ($linkTagMatch in $linkTagMatches) {
        $hrefMatches = Get-HtmlAttributeMatches -Html $linkTagMatch.Value -AttributeName 'href'
        foreach ($hrefMatch in $hrefMatches) {
            Test-LocalReference -Reference $hrefMatch.Groups['value'].Value -SourcePath $IndexPath -Line (Get-LineNumber -Text $html -Index ($linkTagMatch.Index + $hrefMatch.Index)) -TemplateRoot $TemplateRoot
        }
    }

    $srcsetMatches = Get-HtmlAttributeMatches -Html $htmlForValidation -AttributeName 'srcset'
    foreach ($srcsetMatch in $srcsetMatches) {
        $srcsetValue = $srcsetMatch.Groups['value'].Value.Trim()
        if ($srcsetValue -match '^(?i)data:') {
            continue
        }
        foreach ($srcsetEntry in ($srcsetValue -split ',')) {
            $reference = ($srcsetEntry.Trim() -split '\s+', 2)[0]
            Test-LocalReference -Reference $reference -SourcePath $IndexPath -Line (Get-LineNumber -Text $html -Index $srcsetMatch.Index) -TemplateRoot $TemplateRoot
        }
    }
}

function Test-CssFile {
    param(
        [Parameter(Mandatory = $true)][string]$StylePath,
        [Parameter(Mandatory = $true)][string]$TemplateRoot
    )

    $css = [System.IO.File]::ReadAllText($StylePath)
    $cssWithoutComments = Mask-CssComments -Css $css
    $cssOutsideRoot = Mask-CssRootAndComments -Css $css -SourcePath $StylePath
    $declarationPattern = '(?is)(?:\A|[;{])\s*(?<property>--?[a-z][a-z0-9-]*|[a-z][a-z0-9-]*)\s*:\s*(?<value>[^;{}]+)'
    $declarations = [System.Text.RegularExpressions.Regex]::Matches($cssOutsideRoot, $declarationPattern)

    $namedColors = @(
        'aliceblue', 'antiquewhite', 'aqua', 'aquamarine', 'azure', 'beige', 'bisque', 'black',
        'blanchedalmond', 'blue', 'blueviolet', 'brown', 'burlywood', 'cadetblue', 'chartreuse',
        'chocolate', 'coral', 'cornflowerblue', 'cornsilk', 'crimson', 'cyan', 'darkblue', 'darkcyan',
        'darkgoldenrod', 'darkgray', 'darkgreen', 'darkgrey', 'darkkhaki', 'darkmagenta',
        'darkolivegreen', 'darkorange', 'darkorchid', 'darkred', 'darksalmon', 'darkseagreen',
        'darkslateblue', 'darkslategray', 'darkslategrey', 'darkturquoise', 'darkviolet', 'deeppink',
        'deepskyblue', 'dimgray', 'dimgrey', 'dodgerblue', 'firebrick', 'floralwhite', 'forestgreen',
        'fuchsia', 'gainsboro', 'ghostwhite', 'gold', 'goldenrod', 'gray', 'green', 'greenyellow',
        'grey', 'honeydew', 'hotpink', 'indianred', 'indigo', 'ivory', 'khaki', 'lavender',
        'lavenderblush', 'lawngreen', 'lemonchiffon', 'lightblue', 'lightcoral', 'lightcyan',
        'lightgoldenrodyellow', 'lightgray', 'lightgreen', 'lightgrey', 'lightpink', 'lightsalmon',
        'lightseagreen', 'lightskyblue', 'lightslategray', 'lightslategrey', 'lightsteelblue',
        'lightyellow', 'lime', 'limegreen', 'linen', 'magenta', 'maroon', 'mediumaquamarine',
        'mediumblue', 'mediumorchid', 'mediumpurple', 'mediumseagreen', 'mediumslateblue',
        'mediumspringgreen', 'mediumturquoise', 'mediumvioletred', 'midnightblue', 'mintcream',
        'mistyrose', 'moccasin', 'navajowhite', 'navy', 'oldlace', 'olive', 'olivedrab', 'orange',
        'orangered', 'orchid', 'palegoldenrod', 'palegreen', 'paleturquoise', 'palevioletred',
        'papayawhip', 'peachpuff', 'peru', 'pink', 'plum', 'powderblue', 'purple', 'rebeccapurple',
        'red', 'rosybrown', 'royalblue', 'saddlebrown', 'salmon', 'sandybrown', 'seagreen',
        'seashell', 'sienna', 'silver', 'skyblue', 'slateblue', 'slategray', 'slategrey', 'snow',
        'springgreen', 'steelblue', 'tan', 'teal', 'thistle', 'tomato', 'turquoise', 'violet',
        'wheat', 'white', 'whitesmoke', 'yellow', 'yellowgreen'
    )
    $namedColorPattern = '(?i)(?<![-\w])(?:' + (($namedColors | ForEach-Object { [System.Text.RegularExpressions.Regex]::Escape($_) }) -join '|') + ')(?![-\w])'
    $functionalColorPattern = '(?i)\b(?:rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch|color)\s*\((?<arguments>[^)]*)\)'
    $hexColorPattern = '(?i)#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{4}|[0-9a-f]{3})\b'

    foreach ($declaration in $declarations) {
        $property = $declaration.Groups['property'].Value.ToLowerInvariant()
        $valueGroup = $declaration.Groups['value']
        $value = $valueGroup.Value.Trim()
        $line = Get-LineNumber -Text $cssOutsideRoot -Index $declaration.Index

        if (($property -eq 'font-size') -and ($value -notmatch '(?i)\bvar\s*\(')) {
            Add-ValidationError -Path $StylePath -Line $line -Message "Direct font-size '$value' is outside :root; reference a custom property."
        }

        if (($property -match '(?i)^border(?:-[a-z]+){0,3}-radius$') -and ($value -notmatch '(?i)\bvar\s*\(')) {
            Add-ValidationError -Path $StylePath -Line $line -Message "Direct radius '$value' is outside :root; reference a custom property."
        }

        $colorScanValue = [System.Text.RegularExpressions.Regex]::Replace($valueGroup.Value, '(?is)url\([^)]*\)', ' ')
        $colorScanValue = [System.Text.RegularExpressions.Regex]::Replace($colorScanValue, '(?s)"(?:\\.|[^"\\])*"|''(?:\\.|[^''\\])*''', ' ')

        $hexMatches = [System.Text.RegularExpressions.Regex]::Matches($colorScanValue, $hexColorPattern)
        foreach ($hexMatch in $hexMatches) {
            Add-ValidationError -Path $StylePath -Line $line -Message "Direct colour '$($hexMatch.Value)' is outside :root; reference a custom property."
        }

        $functionalMatches = [System.Text.RegularExpressions.Regex]::Matches($colorScanValue, $functionalColorPattern)
        foreach ($functionalMatch in $functionalMatches) {
            if ($functionalMatch.Groups['arguments'].Value -notmatch '(?i)\bvar\s*\(') {
                $token = $functionalMatch.Value
                if ($token.Length -gt 64) {
                    $token = $token.Substring(0, 61) + '...'
                }
                Add-ValidationError -Path $StylePath -Line $line -Message "Direct colour function '$token' is outside :root; reference a custom property."
            }
        }

        $isColorBearingProperty = $property -match '(?i)(?:color|background|border|outline|shadow|fill|stroke|decoration|caret|accent|filter|mask)'
        if ($isColorBearingProperty) {
            $namedMatches = [System.Text.RegularExpressions.Regex]::Matches($colorScanValue, $namedColorPattern)
            foreach ($namedMatch in $namedMatches) {
                Add-ValidationError -Path $StylePath -Line $line -Message "Direct named colour '$($namedMatch.Value)' is outside :root; reference a custom property."
            }
        }
    }

    $urlMatches = [System.Text.RegularExpressions.Regex]::Matches(
        $cssWithoutComments,
        '(?is)url\(\s*(?:"(?<value>[^"]+)"|''(?<value>[^'']+)''|(?<value>[^)\s]+))\s*\)'
    )
    foreach ($urlMatch in $urlMatches) {
        Test-LocalReference -Reference $urlMatch.Groups['value'].Value -SourcePath $StylePath -Line (Get-LineNumber -Text $css -Index $urlMatch.Index) -TemplateRoot $TemplateRoot
    }
}

Write-Host 'BeautyTech template validation' -ForegroundColor Cyan
Write-Host ("Collection: {0}" -f (Get-DisplayPath -Path $templatesRoot))

if (-not (Test-Path -LiteralPath $templatesRoot -PathType Container)) {
    Add-ValidationError -Path $templatesRoot -Message 'Templates directory is missing.'
}
else {
    $actualTemplateDirectories = @(Get-ChildItem -LiteralPath $templatesRoot -Directory -Force)
    $actualTemplateNames = @($actualTemplateDirectories | ForEach-Object { $_.Name })

    if ($actualTemplateNames.Count -ne 3) {
        Add-ValidationError -Path $templatesRoot -Message "Expected exactly three template directories; found $($actualTemplateNames.Count)."
    }

    foreach ($expectedTemplate in $expectedTemplates) {
        if ($actualTemplateNames -notcontains $expectedTemplate) {
            Add-ValidationError -Path (Join-Path $templatesRoot $expectedTemplate) -Message 'Expected template directory is missing.'
        }
    }

    foreach ($actualTemplate in $actualTemplateNames) {
        if ($expectedTemplates -notcontains $actualTemplate) {
            Add-ValidationError -Path (Join-Path $templatesRoot $actualTemplate) -Message 'Unexpected template directory.'
        }
    }

    foreach ($templateName in $expectedTemplates) {
        $templateRoot = Join-Path $templatesRoot $templateName
        if (-not (Test-Path -LiteralPath $templateRoot -PathType Container)) {
            continue
        }

        Write-Host ("Checking {0}..." -f $templateName)
        foreach ($entry in $requiredEntries) {
            $entryPath = Join-Path $templateRoot $entry
            $expectedPathType = if ($entry -eq 'assets') { 'Container' } else { 'Leaf' }
            if (-not (Test-Path -LiteralPath $entryPath -PathType $expectedPathType)) {
                Add-ValidationError -Path $entryPath -Message "Required $expectedPathType '$entry' is missing."
            }
        }

        $assetsPath = Join-Path $templateRoot 'assets'
        if ((Test-Path -LiteralPath $assetsPath -PathType Container) -and (@(Get-ChildItem -LiteralPath $assetsPath -File -Recurse -Force).Count -eq 0)) {
            Add-ValidationWarning -Path $assetsPath -Message 'Assets directory is empty.'
        }

        $indexPath = Join-Path $templateRoot 'index.html'
        if (Test-Path -LiteralPath $indexPath -PathType Leaf) {
            Test-HtmlFile -IndexPath $indexPath -TemplateRoot ([System.IO.Path]::GetFullPath($templateRoot))
        }

        $stylePath = Join-Path $templateRoot 'style.css'
        if (Test-Path -LiteralPath $stylePath -PathType Leaf) {
            Test-CssFile -StylePath $stylePath -TemplateRoot ([System.IO.Path]::GetFullPath($templateRoot))
        }
    }
}

if ($script:Warnings.Count -gt 0) {
    Write-Host "`nWarnings ($($script:Warnings.Count))" -ForegroundColor Yellow
    foreach ($warning in $script:Warnings) {
        Write-Host "  WARN  $warning" -ForegroundColor Yellow
    }
}

if ($script:Errors.Count -gt 0) {
    Write-Host "`nErrors ($($script:Errors.Count))" -ForegroundColor Red
    foreach ($validationError in $script:Errors) {
        Write-Host "  FAIL  $validationError" -ForegroundColor Red
    }
    Write-Host "`nValidation failed with $($script:Errors.Count) error(s) and $($script:Warnings.Count) warning(s)." -ForegroundColor Red
    exit 1
}

Write-Host "`nPASS: all three BeautyTech template kits passed with $($script:Warnings.Count) warning(s)." -ForegroundColor Green
exit 0
