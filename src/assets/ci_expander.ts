import {RenderingContext} from "./context";
import {RepoResolver} from "../repo/resolver";
import {Recipe} from "../repo/recipe";

export class CloudInitRecipeReferenceExpander {
    protected readonly context: RenderingContext;
    protected readonly repoResolver: RepoResolver;
    protected readonly initialRecipes: string[];
    protected explanations: string[];
    protected preExpandRecipes: string[];
    private expandedRecipes: string[];

    constructor(context: RenderingContext, resolver: RepoResolver, initialRecipes: string[]) {
        this.context = context;
        this.repoResolver = resolver;
        this.initialRecipes = initialRecipes;
        this.preExpandRecipes = initialRecipes;
        this.expandedRecipes = initialRecipes;
        this.explanations = [];
    }

    async expand(): Promise<string[]> {
        // get a full flat list of available recipes in the repo; those closest to root override those farthest away
        let availableRecipesMap: Map<string, Recipe> = await this.repoResolver.getFullFlatRecipeList();
        let availableRecipesArr: Recipe[] = [...availableRecipesMap.values()];
        console.log("availableRecipes", availableRecipesArr.map(value => value.id));

        // iterate the available and evaluate expand_if and always_expand
        //   (against the initially specified list?)
        let auto_included: string[] = availableRecipesArr
            .filter(recipe => this.shouldAutoIncludeRecipe(recipe))
            .map(value => value.id);
        console.log("auto_included", auto_included);

        // preExpandRecipes is initial plus the auto included
        this.preExpandRecipes.unshift(...auto_included);
        console.log("After auto includes, ", this.initialRecipes);


        // pick the initially specified ones from the list and use that as starting point.
        //  (what if we can't find one?) throw!
        let pickedRecipes: Recipe[] = [];
        for (const initialRecipe of this.preExpandRecipes) {
            pickedRecipes.push(<Recipe>availableRecipesMap.get(initialRecipe));
        }

        // now each of those picked can 'expand' into more
        this.expandedRecipes = pickedRecipes.flatMap((recipe: Recipe) => {
            return this.expandRecipe(recipe)
        });

        // hmm, then filters should kick in, by os or something else;
        console.log("Final expanded recipes", this.expandedRecipes);

        console.log("this.explanations", this.explanations);

        return this.expandedRecipes;
    }

    private shouldAutoIncludeRecipe(recipe: Recipe): boolean {
        if (recipe.def.always_include) {
            this.explanations.push(`Recipe ${recipe.id} included because always_include!`);
            return true;
        }
        if (recipe.def.include_if_recipe) {
            if (recipe.def.include_if_recipe.some(if_yes => {
                return this.initialRecipes.some(initial_recipe => initial_recipe === if_yes)
            })) {
                this.explanations.push(`Recipe ${recipe.id} included because include_if_recipe!`);
                return true;
            }
        }
        if (recipe.def.include_if_not_recipe && (recipe.def.include_if_not_recipe.length > 0)) {
            if (recipe.def.include_if_not_recipe.every(if_not => {
                return !this.initialRecipes.some(initial_recipe => initial_recipe === if_not)
            })) {
                this.explanations.push(`Recipe ${recipe.id} included because include_if_not_recipe!`);
                return true;
            }
        }
        return false;
    }

    private expandRecipe(recipe: Recipe): string[] {
        let expanded = [recipe.id];
        if (recipe.def.expand) expanded.push(...recipe.def.expand);
        console.log(`Recipe ${recipe.id} expanded to ${expanded}`);
        return expanded;
    }
}
