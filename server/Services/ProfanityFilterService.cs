using System.Text;
using System.Text.RegularExpressions;

namespace SellWithEllie.Services;

// A basic, general-purpose chat filter - not a full anti-evasion system.
// It normalizes common leetspeak substitutions and stretched-out letters
// ("fuuuck") via regex, but won't catch spaced-out letters ("f u c k") or
// unrelated look-alikes. Good enough to keep everyday chat clean; extend
// the word lists below as needed.
public class ProfanityFilterService : IProfanityFilterService
{
    private static readonly string[] EnglishWords =
    {
        "fuck", "shit", "bitch", "asshole", "bastard", "dick", "piss",
        "cunt", "slut", "whore", "douche", "crap", "prick", "cock",
        "twat", "wanker", "motherfucker", "fucker", "nigger", "nigga",
        "faggot", "retard"
    };

    // Common Tagalog/Filipino profanity and insults.
    private static readonly string[] TagalogWords =
    {
        "putangina", "puta", "putang", "gago", "gaga", "tanga",
        "tarantado", "ulol", "bobo", "tangina", "pakshet", "peste",
        "hayop", "leche", "hinayupak", "kupal", "punyeta", "siraulo",
        "engot", "bwisit", "lintik", "kingina", "yawa"
    };

    private readonly List<Regex> _patterns;

    public ProfanityFilterService()
    {
        _patterns = EnglishWords.Concat(TagalogWords)
            .Select(BuildPattern)
            .ToList();
    }

    // Builds a case-insensitive regex for one banned word that also matches
    // common leetspeak substitutions (@ / 4 for a, 3 for e, 1 / ! for i,
    // 0 for o, $ / 5 for s) and repeated letters, so "fuuuck" and "sh1t"
    // are caught the same as the plain word.
    private static Regex BuildPattern(string word)
    {
        var sb = new StringBuilder(@"\b");
        foreach (var c in word)
        {
            var charClass = char.ToLowerInvariant(c) switch
            {
                'a' => "[a@4]",
                'e' => "[e3]",
                'i' => "[i1!]",
                'o' => "[o0]",
                's' => "[s$5]",
                _ => Regex.Escape(c.ToString())
            };
            sb.Append(charClass).Append('+');
        }
        // \b never matches between two word characters, so a bare trailing
        // \b silently missed every inflected form ("fuck-ing", "shit-ty",
        // "dick-s") - found by actually sending "this is fucking awesome"
        // through the filter in QA and seeing it pass uncensored. Allow one
        // common English suffix to sit between the word and the boundary;
        // the leading \b (unchanged) still blocks mid-word false positives
        // like "class"/"assassin" containing "ass".
        sb.Append(@"(?:ing|ings|ed|er|ers|s|y|es)?\b");
        return new Regex(sb.ToString(), RegexOptions.IgnoreCase | RegexOptions.Compiled);
    }

    public (string Filtered, bool WasFiltered) Filter(string message)
    {
        if (string.IsNullOrEmpty(message))
        {
            return (message, false);
        }

        var wasFiltered = false;
        var result = message;

        foreach (var pattern in _patterns)
        {
            result = pattern.Replace(result, match =>
            {
                wasFiltered = true;
                return new string('*', match.Length);
            });
        }

        return (result, wasFiltered);
    }
}
